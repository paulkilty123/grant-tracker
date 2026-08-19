// Which review-queue tab does a row land in, and why?
//
// Written after a fix moved a row out of Paul's "Needs your judgement" tab
// without anyone intending it to. The tab a row appears in is derived from
// three layers — reason codes, the publish gate's blocking set, then
// `sectionOf` — and none of them is visible from the row itself, so "why did
// this disappear" was previously guesswork. This answers it from the real code
// paths rather than by reading them.
//
// `--as key=value,...` re-runs the derivation against a hypothetical row, so
// you can ask where a change WOULD put it before writing anything.
//
//   npx tsx --env-file=.env.local scripts/where-does-row-land.ts <uuid>
//   npx tsx --env-file=.env.local scripts/where-does-row-land.ts <uuid> --as pipeline_state=published,deadline=2026-06-07
import { createClient } from '@supabase/supabase-js'
import { deriveReviewReasons } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { sectionOf } from '../src/lib/admin/review-sections'

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
const STUB_BRIEF_SOURCES = ['knowledge_fallback', 'desk_research']

const id = process.argv[2]
const asArg = process.argv.includes('--as') ? process.argv[process.argv.indexOf('--as') + 1] : null

function overrides(spec: string | null): Record<string, unknown> {
  if (!spec) return {}
  return Object.fromEntries(spec.split(',').map(pair => {
    const [k, ...rest] = pair.split('=')
    const v = rest.join('=')
    return [k.trim(), v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v]
  }))
}

function report(label: string, row: Record<string, unknown>) {
  const reasons = deriveReviewReasons(row as never)
  const gate = gateDecision(row as never, reasons)
  // `gate.blocking` is ReviewReason objects, not codes. Passing it straight to
  // `sectionOf` type-errors and, before that error was fixed, printed
  // "[object Object]" while still returning a plausible-looking section.
  const blocking = gate.blocking.map(r => r.code)
  const all = reasons.map(r => r.code)
  const state = String(row.pipeline_state ?? '')
  const briefSource = (row.funder_brief as { source?: string } | null)?.source ?? ''
  // Why the row is on the screen AT ALL. `sectionOf` never sees this — it only
  // decides where a row goes once something has already selected it.
  const onScreen =
    QUEUE_STATES.includes(state) ? 'queue state'
    : state === 'published' && STUB_BRIEF_SOURCES.includes(briefSource) ? 'published with a stub brief'
    : state === 'published' && row.is_active === true ? 'live (Live and wrong / Live, nothing blocking)'
    : 'NOT SELECTED — invisible on the review screen'

  console.log(`\n── ${label}`)
  console.log(`   state=${state}  active=${row.is_active}  deadline=${row.deadline}  brief=${briefSource || '(none)'}`)
  console.log(`   on screen because: ${onScreen}`)
  console.log(`   reasons:  ${all.join(', ') || '(none)'}`)
  console.log(`   blocking: ${blocking.join(', ') || '(none)'}`)
  console.log(`   SECTION:  ${sectionOf(blocking, all)}`)
}

async function main() {
  if (!id) { console.error('usage: where-does-row-land.ts <uuid> [--as k=v,...]'); process.exit(1) }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('scraped_grants').select('*').eq('id', id).limit(1)
  if (!data?.length) { console.error('no such row'); process.exit(1) }
  const row = data[0] as Record<string, unknown>
  console.log(`\n${row.title}`)
  report('as it is now', row)
  const o = overrides(asArg)
  if (Object.keys(o).length) report(`with ${asArg}`, { ...row, ...o })
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

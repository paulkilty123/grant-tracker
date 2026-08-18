// Resolve the review queue's five sections to concrete row ids, offline.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/review-queue-sections-2026-08-18.ts [--section=reading,untruthful]
//
// READ ONLY. Writes nothing, POSTs nothing, and does not touch an admin route.
//
// Why this exists: the "Not live yet — 116" figure and its five sections are
// computed in the review page's server component, so the only way to see which
// rows are in which section was to load the page. Two sessions splitting the
// queue by section need the ids, not the counts, or the split is an argument
// rather than a partition. This reproduces the page's own pipeline —
// deriveReviewReasons → gateDecision → sectionOf — against the same three
// queries, so the sections it prints are the sections the page shows.
//
// Kept in step with src/app/dashboard/admin/review/page.tsx: COLS, QUEUE_STATES
// and the stub-brief query are copied from it because a page.tsx may only export
// a default and metadata, so they cannot be imported.
import { getAdminDb } from '../src/lib/admin/admin-db'
import { deriveReviewReasons } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { sectionOf, SECTIONS, type SectionId } from '../src/lib/admin/review-sections'
import { STUB_BRIEF_SOURCES } from '../src/lib/funder-brief'

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

const COLS = [
  'id', 'external_id', 'title', 'funder', 'apply_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries', 'niche_tags', 'funding_type',
  'funder_type', 'location_tag', 'is_local',
  'grant_sources',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
  'field_evidence',
  'last_seen_at',
  'first_seen_at', 'source',
].join(', ')

const wanted = (() => {
  const arg = process.argv.find(a => a.startsWith('--section='))
  if (!arg) return null
  return new Set(arg.slice('--section='.length).split(',').map(s => s.trim()))
})()

async function main() {
  const db = getAdminDb()

  const { data: queued, error } = await db
    .from('scraped_grants').select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false }).limit(500)
  if (error) throw new Error(`queue query: ${error.message}`)

  const { data: stubs } = await db
    .from('scraped_grants').select(COLS)
    .eq('pipeline_state', 'published')
    .in('funder_brief->>source', STUB_BRIEF_SOURCES as unknown as string[])
    .not('saved_for_later', 'is', 'true')
    .order('last_seen_at', { ascending: false }).limit(300)

  const seen = new Set<string>()
  const fetched = [
    ...((queued ?? []) as unknown as Record<string, unknown>[]),
    ...((stubs  ?? []) as unknown as Record<string, unknown>[]),
  ]
  const rows = fetched.filter(r => {
    const id = String(r.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  const bySection = new Map<SectionId, { id: string; title: string; funder: string; live: boolean; codes: string[] }[]>()

  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reasons = deriveReviewReasons(r as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gate = gateDecision(r as any, reasons)
    const blocking = gate.blocking.map(b => b.code)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (reasons as any[]).map(x => String(x.code))
    const s = sectionOf(blocking, all)
    if (!bySection.has(s)) bySection.set(s, [])
    bySection.get(s)!.push({
      id: String(r.id),
      title: String(r.title ?? '').slice(0, 54),
      funder: String(r.funder ?? '').slice(0, 30),
      live: r.is_active === true,
      codes: blocking,
    })
  }

  let total = 0
  for (const sec of SECTIONS) {
    const all = bySection.get(sec.id) ?? []
    const list = all.filter(x => !x.live)
    const liveN = all.length - list.length
    total += list.length
    if (wanted && !wanted.has(sec.id)) continue
    console.log(`\n══ ${sec.label} — ${list.length} not live  (+${liveN} live, excluded)`)
    if (!wanted) continue
    for (const it of list) {
      console.log(`${it.id}  ${it.live ? 'LIVE ' : '     '} ${it.title.padEnd(54)} ${it.funder.padEnd(30)} ${it.codes.join(',')}`)
    }
  }
  console.log(`\nNot-live total: ${total}  (of ${rows.length} rows fetched)`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

// "Live and wrong" — the rows a user can see RIGHT NOW that carry a blocking
// reason. The mirror of review-queue-sections-2026-08-18.ts, which deliberately
// filters live rows out because it exists to split the not-live queue.
//
// Same pipeline as the review page: deriveReviewReasons → gateDecision. A row is
// here when it is `is_active` and the gate would not publish it.
//
// READ ONLY.
//
//   npx tsx --env-file=.env.local scripts/live-and-wrong-2026-08-18.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { deriveReviewReasons } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
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
  'last_seen_at', 'first_seen_at', 'source',
].join(', ')

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
  const rows = [
    ...((queued ?? []) as unknown as Record<string, unknown>[]),
    ...((stubs ?? []) as unknown as Record<string, unknown>[]),
  ].filter(r => {
    const id = String(r.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  const out: { id: string; title: string; funder: string; state: string; codes: string[] }[] = []
  for (const r of rows) {
    if (r.is_active !== true) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reasons = deriveReviewReasons(r as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gate = gateDecision(r as any, reasons)
    if (gate.outcome !== 'attention') continue
    out.push({
      id: String(r.id),
      title: String(r.title ?? '').slice(0, 50),
      funder: String(r.funder ?? '').slice(0, 26),
      state: String(r.pipeline_state ?? ''),
      codes: gate.blocking.map(b => b.code),
    })
  }

  out.sort((a, b) => a.title.localeCompare(b.title))
  for (const it of out) {
    console.log(`${it.id}  ${it.title.padEnd(50)} ${it.funder.padEnd(26)} ${it.codes.join(',')}`)
  }
  console.log(`\nLive and wrong: ${out.length}  (of ${rows.length} rows fetched)`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

// Publish the review-queue rows whose ONLY outstanding reason is "tags changed".
//
//   npx tsx scripts/bulk-publish-tags-changed.ts          # dry run (default)
//   npx tsx scripts/bulk-publish-tags-changed.ts --apply  # write
//
// WHY THIS IS SAFE NOW AND WAS NOT BEFORE
//
// "Tags changed" means a re-classification altered this row's tags. Until today
// that was a real question, because the classifier could narrow eligibility on
// no evidence at all: it returned a shorter non-empty list whenever a page was
// silent on legal form, and that list replaced the stored array wholesale.
// Measured over this queue: 4.05 -> 3.61 structures per row in a single pass,
// 152 values removed against 117 added, concentrated on cooperative,
// unincorporated and the ltd forms.
//
// Two things changed that:
//   1. classify.ts now requires evidence to REMOVE a structure (additions still
//      land immediately). A re-classification can no longer silently narrow.
//   2. 24 rows had wrongly-removed values restored, each only where the row's own
//      text positively supports the structure.
//
// So the diffs these rows are showing are now diffs we believe. Approving them
// one at a time would be 41 clicks to say "yes" 41 times.
//
// ── STRICTLY only tags_changed ──
// A row with any other reason — unreadable page, no eligibility, no deadline,
// dead link — is NOT included, whatever its diff looks like. Those are real
// questions and they stay in the queue.
//
// ── STATE ──
// is_active AND pipeline_state are written together. is_active makes a row
// visible; pipeline_state is what removes it from the queue, which selects on
// state. Writing only is_active was a live bug in the review UI: the row
// vanished client-side and returned on the next refresh, so the queue could
// never shrink. Neither column is in TRACKED_FIELDS, so this pins nothing and
// the tags stay improvable by future automated passes.
//
// ── PROVENANCE ──
// Written directly with the service-role client rather than through
// mergeGrantUpdate, because neither field is tracked — there is no provenance to
// stamp and no trust ladder to consult. Going through the merger would be
// misleading, not safer.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { charityFormJurisdiction } from '../src/lib/classify'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
const COLS = [
  'id', 'title', 'funder', 'apply_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason', 'location_tag',
].join(', ')

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .limit(1000)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = (data ?? []) as unknown as Array<ReviewRow & {
    title: string; funder: string | null; is_active: boolean; pipeline_state: string
  }>

  const tagsChangedOnly = rows.filter(r => {
    const reasons = deriveReviewReasons(r)
    return reasons.length > 0 && reasons.every(x => x.code === 'tags_changed')
  })

  // Jurisdiction gate — publishing must not make a geographically impossible tag
  // live. scripts/fix-scio-jurisdiction.ts only ever ran over is_active=true
  // rows, so an INACTIVE queue row can still carry a cio/scio from before that
  // cleanup. Publishing it is precisely the over-tagging direction: a Scottish
  // charity shown a London fund it cannot apply to wastes a real application.
  //
  // Caught live on the first run: Greenwich Peninsula Community Fund, a London
  // fund, was tagged scio and was the only row this batch would have newly
  // revealed.
  const blocked: Array<{ row: typeof rows[0]; bad: string[] }> = []
  const eligible = tagsChangedOnly.filter(r => {
    const { cioAllowed, scioAllowed } = charityFormJurisdiction({ locationTag: r.location_tag })
    const structures = r.eligible_structures ?? []
    const bad = [
      ...(structures.includes('scio') && !scioAllowed ? ['scio'] : []),
      ...(structures.includes('cio')  && !cioAllowed  ? ['cio']  : []),
    ]
    if (bad.length > 0) { blocked.push({ row: r, bad }); return false }
    return true
  })

  // Rows that are NOT yet visible are being shown to users for the first time.
  // That is a different act from confirming something already live, and it
  // deserves to be counted out loud rather than buried in a total.
  const alreadyLive = eligible.filter(r => r.is_active === true)
  const newlyVisible = eligible.filter(r => r.is_active !== true)

  console.log(`\nqueue: ${rows.length} rows`)
  console.log(`only reason is "tags changed": ${eligible.length}`)
  console.log(`  already visible to users, this just confirms them : ${alreadyLive.length}`)
  console.log(`  NOT currently visible — publishing reveals them   : ${newlyVisible.length}`)

  if (newlyVisible.length > 0) {
    console.log('\nrows that become visible to users for the first time:')
    for (const r of newlyVisible) {
      console.log(`  ${(r.funder ?? '').slice(0, 30).padEnd(30)} ${r.title.slice(0, 46)}`)
    }
  }

  if (blocked.length > 0) {
    console.log(`\nHELD BACK — jurisdiction-impossible tag, must be fixed before publishing:`)
    for (const b of blocked) {
      console.log(`  ${b.row.title.slice(0, 46).padEnd(46)} location=${b.row.location_tag}  carries ${b.bad.join(', ')}`)
    }
  }

  console.log(`\nrows staying in the queue (other reasons or held back): ${rows.length - eligible.length}`)

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  // Batched so one failure cannot take the whole run down silently.
  let published = 0, failed = 0
  for (let i = 0; i < eligible.length; i += 50) {
    const slice = eligible.slice(i, i + 50)
    const { error: e } = await db
      .from('scraped_grants')
      .update({ is_active: true, pipeline_state: 'published' })
      .in('id', slice.map(r => r.id))
    if (e) { failed += slice.length; console.error(`  batch failed: ${e.message}`) }
    else published += slice.length
  }

  // Read back. An update that matched zero rows returns no error, so a count is
  // the only honest confirmation that anything happened.
  const { count } = await db
    .from('scraped_grants')
    .select('*', { count: 'exact', head: true })
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')

  console.log(`\npublished ${published}, failed ${failed}`)
  console.log(`queue now: ${count} rows (was ${rows.length})\n`)
}

main()

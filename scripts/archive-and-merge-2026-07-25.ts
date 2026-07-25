// Archive rows for programmes that no longer exist, and merge confirmed duplicates.
//
// Every verdict here came from reading the funder's own site, with a verbatim
// quote recorded in docs/audits/shared-apply-url-verdicts-2026-07-25.json.
//
//   npx tsx scripts/archive-and-merge-2026-07-25.ts          # dry run (default)
//   npx tsx scripts/archive-and-merge-2026-07-25.ts --apply  # write
//
// ── ARCHIVE, NEVER DELETE ──
// These rows carry user history: 8 grant_interactions (saved and dismissed) and
// 4 pipeline_items, including one user sitting at stage 'submitted' on BBC
// Children in Need Main Grants — a programme that closed in 2021.
//
// Deleting the row would orphan those interactions (grant_interactions.grant_id
// is text and holds a mix of UUIDs and legacy external_id strings, with no FK to
// enforce anything). Setting is_active=false removes the row from every user
// surface while leaving their history intact, and pipeline_items are the user's
// own copies keyed by name/url, so their board is untouched either way.
//
// Both keys are checked before archiving because interactions exist under BOTH
// the UUID and the external_id for these rows.
//
// ── STATE ──
// is_active=false AND pipeline_state='archived' are set together. Setting only
// one produces the known desync where 109 rows sit published+inactive and never
// surface in any admin queue again.
//
// ── PROVENANCE ──
// is_active, pipeline_state and rejection_reason are NOT tracked fields, so they
// are written directly. Ported values (description, location_tag) ARE tracked
// and go through mergeGrantUpdate as `system:dedup_merge_2026-07-25` (trust 50)
// — deliberately not admin:, which would auto-pin a value carried over from
// another row and freeze it against future correction.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'system:dedup_merge_2026-07-25'

/** Programmes the funder's own site says no longer exist. */
const CLOSED: Array<{ id: string; title: string; reason: string }> = [
  { id: '73f90eb8-c0cb-4cf5-b11e-81d4601f81fa', title: 'BBC Children in Need Small Grants',
    reason: "Closed. Funder FAQ: 'Our Small and Main grants programmes closed in 2021.' Superseded by Core Costs and Project Costs." },
  { id: '0d061c73-9285-4445-a242-6425c7a89995', title: 'BBC Children in Need Main Grants',
    reason: "Closed. Funder FAQ: 'Our Small and Main grants programmes closed in 2021.' Superseded by Core Costs and Project Costs." },
  { id: 'c620df67-d051-473e-b6c2-c5d89003b6ec', title: 'National Churches Trust — Community Mission Grants',
    reason: 'No NCT programme of this name exists. Describes the retired 2008 Community Grants scheme, now folded into Large Grants. Both candidate slugs 404.' },
  { id: 'f2a00b69-693f-490d-80e3-51547c177655', title: 'Ufi VocTech Trust — Seedbed',
    reason: "No Ufi fund called Seedbed. Describes VocTech Seed, retired and 301'd to VocTech Activate, which is itself closed to applications." },
  { id: '7d46d20f-6ce6-498b-a6f3-77758a2414d7', title: 'Social Investment Business — Growth Fund',
    reason: "Misattributed and closed. The Growth Fund was Access's programme (£48.6m, 2016-2023), not SIB's. No such page on sibgroup.org.uk." },
]

/**
 * Confirmed duplicates. `port` carries fields the loser holds in better shape.
 * Only ported where the loser's value is demonstrably better, never wholesale.
 */
const DUPES: Array<{
  loser: string; loserTitle: string
  keeper: string; keeperTitle: string
  reason: string
  port?: Record<string, unknown>
}> = [
  {
    loser: 'ab8dd936-a606-4f74-8b89-583e8e94ae88', loserTitle: 'Arts and Science Grants',
    keeper: '9e29e607-f4aa-488f-a0d0-190d2a21880a', keeperTitle: 'Granada Foundation — Grants',
    reason: 'Duplicate. Granada Foundation runs one unnamed scheme; both rows carry the same deadline and the same £500-£10,000 range. "Arts and Science Grants" is not the funder\'s wording.',
    // The keeper says 'Manchester'; the foundation funds Greater Manchester,
    // Liverpool City Region, Lancashire, Cheshire, High Peak, Westmorland and
    // Furness, and Cumberland. The loser's wider tag is the correct one.
    port: { location_tag: 'North West England' },
  },
  {
    loser: 'eec8bb3a-d6b0-4806-bf0c-47c40784f747', loserTitle: 'Grants for Greater Manchester Charities',
    keeper: '581fab6f-e73b-4584-82fd-d0ab9f355aed', keeperTitle: 'Zochonis Charitable Trust — Grants',
    reason: 'Duplicate. Zochonis runs one unnamed grants programme across four categories. No scheme of this name exists in the funder\'s wording. This row also carried amount 0-0, which renders as a false £0.',
  },
  {
    loser: 'c55985ea-2ad1-4214-84ae-420ead940bb0', loserTitle: 'Black Seed Investment Fund',
    keeper: '55d3592a-1a6b-4495-9f55-e772f1857d60', keeperTitle: 'Black Seed VC',
    reason: 'Duplicate. Same entity, same £100k-£400k ticket, same founder gate. The site names exactly one vehicle, "Black Seed VC"; no fund called "Black Seed Investment Fund" exists.',
  },
  {
    loser: 'c95b14e4-f4a1-4fed-aa6b-6bc3fe996d91', loserTitle: 'Jack Petchey Achievement Awards',
    keeper: '1694669a-605f-44ea-9775-c6a492f0362e', keeperTitle: 'Achievement Award Scheme',
    // Deliberately the opposite direction to the other three: the row with the
    // tidier-looking title is the one being archived. The keeper matches the
    // funder's own page heading AND carries the right figures (£300 per winner,
    // up to £6,400 a year per organisation); the loser had amount_min null and
    // amount_max £1,000, which is simply wrong. The keeper also holds a user's
    // saved interaction under external_id cat-seed-jack-petchey-grant-award.
    reason: 'Duplicate of the Achievement Award Scheme row, which matches the funder\'s own page heading and carries the correct figures (£300 per winner, up to £6,400 per year per organisation) where this row had £0-£1,000.',
  },
]

type Row = { id: string; title: string; is_active: boolean; pipeline_state: string; external_id: string | null }

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const ids = [...CLOSED.map(c => c.id), ...DUPES.map(d => d.loser), ...DUPES.map(d => d.keeper)]
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, is_active, pipeline_state, external_id')
    .in('id', ids)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = new Map((data ?? []).map(r => [r.id as string, r as Row]))

  // Every keeper must still be live, or the merge would archive the duplicate
  // and leave nothing behind.
  for (const d of DUPES) {
    const k = rows.get(d.keeper)
    if (!k)            { console.error(`ABORT: keeper ${d.keeperTitle} not found`); process.exit(1) }
    if (!k.is_active)  { console.error(`ABORT: keeper ${d.keeperTitle} is not active — merging into it would hide the fund entirely`); process.exit(1) }
  }

  // Interaction counts under BOTH keys, so the report states what user history
  // is attached rather than assuming there is none.
  const archiveIds = [...CLOSED.map(c => c.id), ...DUPES.map(d => d.loser)]
  const keys = archiveIds.flatMap(id => {
    const r = rows.get(id)
    return r?.external_id ? [id, r.external_id] : [id]
  })
  const { data: ints } = await db.from('grant_interactions').select('grant_id, action').in('grant_id', keys)
  const intBy = new Map<string, number>()
  for (const i of (ints ?? []) as { grant_id: string }[]) intBy.set(i.grant_id, (intBy.get(i.grant_id) ?? 0) + 1)
  const countFor = (id: string) => {
    const r = rows.get(id)
    return (intBy.get(id) ?? 0) + (r?.external_id ? (intBy.get(r.external_id) ?? 0) : 0)
  }

  console.log('\nARCHIVE — programme no longer exists:')
  for (const c of CLOSED) {
    const r = rows.get(c.id)
    console.log(`  ${r ? (r.is_active ? 'LIVE' : 'off ') : '????'} ${c.title}`)
    console.log(`       ${c.reason}`)
    console.log(`       user interactions attached: ${countFor(c.id)}`)
  }

  console.log('\nMERGE — duplicate, archived in favour of the keeper:')
  for (const d of DUPES) {
    console.log(`  archive  ${d.loserTitle}   (interactions: ${countFor(d.loser)})`)
    console.log(`  keep     ${d.keeperTitle}`)
    if (d.port) console.log(`  port     ${JSON.stringify(d.port)}`)
    console.log(`       ${d.reason}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let archived = 0, ported = 0, portRejected = 0, failed = 0

  // Port first. If a port fails, the operator sees it BEFORE the source row is
  // hidden, while it is still easy to look at.
  for (const d of DUPES) {
    if (!d.port) continue
    try {
      const res = await mergeGrantUpdate({ id: d.keeper, fields: d.port, source: SOURCE, pinned: false, db })
      const wrote = Object.keys(d.port).filter(f => res.applied.includes(f))
      if (wrote.length) { ported++; console.log(`  ported ${wrote.join(', ')} → ${d.keeperTitle}`) }
      else { portRejected++; console.error(`  PORT REJECTED on ${d.keeperTitle}: ${JSON.stringify(res.rejected)} — archiving the duplicate anyway, but the keeper keeps its old value`) }
    } catch (err) {
      portRejected++
      console.error(`  port failed on ${d.keeperTitle}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const toArchive = [
    ...CLOSED.map(c => ({ id: c.id, title: c.title, reason: c.reason })),
    ...DUPES.map(d => ({ id: d.loser, title: d.loserTitle, reason: d.reason })),
  ]
  for (const a of toArchive) {
    const { error: e } = await db
      .from('scraped_grants')
      // Both together. is_active alone leaves the row invisible to users but
      // stuck in a live pipeline_state, which is the desync that hides rows from
      // every admin queue.
      .update({ is_active: false, pipeline_state: 'archived', rejection_reason: a.reason })
      .eq('id', a.id)
    if (e) { failed++; console.error(`  failed: ${a.title}: ${e.message}`) }
    else archived++
  }

  console.log(`\narchived ${archived}, ported ${ported}, port rejected ${portRejected}, failed ${failed}\n`)
}

main()

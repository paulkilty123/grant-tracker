// "Rolling, apply any time" asserted by nobody.
//
// 324 of 607 live rows carry `is_rolling = true`. The funder's page confirms it
// on 89 and disputes it on 14; on 221 the page says nothing at all. Paul, on
// being shown that: "rolling has been the issue for a while."
//
// The CARD was fixed in August — it no longer infers "Rolling" from a missing
// deadline. What remains is the data: rows where `is_rolling = true` is stored
// as a fact, and the fact has no author.
//
// WHO SET IT. Of the 221:
//
//   admin:legacy        74   backfilled, unpinned — a migration, not a decision
//   seed:legacy         22   backfilled
//   (no source at all)  21   predates provenance
//   discovery:legacy     8   backfilled
//   ------------------------------------------------------------------
//   this script         125
//
//   admin:paulkilty1     17   PINNED. Paul's own call. Untouched.
//   admin:paul@gt         3   PINNED. Untouched.
//   various scrapers     38   backfilled assertions, LEFT for now and reported
//   other               ~38
//
// Only the 125 with no author are cleared. `admin:legacy` reads like a decision
// and is not one: `trustOf` already downgrades it to 35 precisely because it is a
// backfill stamp, and none of these 74 are pinned or carry a previous value.
//
// WHAT CHANGES FOR A USER. The card goes from "Rolling, apply any time" to
// "Check website". That is a downgrade in confidence and an upgrade in honesty:
// we do not know, and some of these funds genuinely are rolling. Nothing is
// hidden — the search filter admits a row on `deadline is null` as well as on
// `is_rolling`, so visibility is unchanged. Checked before writing.
//
// FALSE, NOT NULL. The column defaults to false and every consumer treats null
// and false alike, so null would buy no extra meaning while making two states
// out of one.
//
//   npx tsx --env-file=.env.local scripts/clear-unsourced-rolling-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/clear-unsourced-rolling-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'system:rolling-unsourced-2026-08-20'

/** Sources that are a migration stamp rather than anybody's decision. */
const AUTHORLESS = ['admin:legacy', 'seed:legacy', 'discovery:legacy']

/**
 * And only where "rolling" fights the norm for that kind of funding.
 *
 * The 130 authorless rows split grant 79, in_kind 23, investment 17, programme
 * 11 — and the same unsourced flag means different things across them. Most
 * GRANTS run in rounds, so an unsourced "apply any time" is a claim against the
 * grain and the one that costs a fundraiser a deadline. Most social LOANS and
 * in-kind offers genuinely are always-open: a CDFI takes applications whenever
 * you ask, and Canva does not have a closing date. Clearing those would trade a
 * probably-true label for "Check website" and make the catalogue less useful
 * without making it more honest.
 *
 * This is a judgement about how each kind of funding works, not evidence, and it
 * is written down here so it can be argued with rather than discovered later.
 */
const AGAINST_THE_GRAIN = ['grant', 'programme']

type Row = { id: string; title: string; deadline: string | null; funding_type: string | null; field_provenance: Record<string, { source?: string; pinned?: boolean }> | null }

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, deadline, funding_type, field_provenance')
      .eq('is_active', true).eq('pipeline_state', 'published').eq('is_rolling', true)
      .range(from, from + 499)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    rows.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 500) break
  }

  // Only rows the page has NOT confirmed. A confirmed rolling flag stays whoever
  // set it — the evidence is what matters, not the provenance.
  const { data: confirmedIds } = await db.from('scraped_grants')
    .select('id').eq('is_active', true).eq('pipeline_state', 'published')
    .eq('field_evidence->is_rolling->>agrees', 'true')
  const confirmed = new Set((confirmedIds ?? []).map(r => (r as { id: string }).id))

  const authorless = rows.filter(r => {
    if (confirmed.has(r.id)) return false
    const p = r.field_provenance?.is_rolling
    if (p?.pinned) return false
    const src = p?.source
    return src === undefined || src === null || AUTHORLESS.includes(src)
  })
  const targets = authorless.filter(r => AGAINST_THE_GRAIN.includes(r.funding_type ?? 'grant'))
  const leftAlone = authorless.filter(r => !AGAINST_THE_GRAIN.includes(r.funding_type ?? 'grant'))

  console.log(`\nlive rows claiming rolling : ${rows.length}`)
  console.log(`of those, page-confirmed   : ${rows.filter(r => confirmed.has(r.id)).length}`)
  console.log(`authorless and unconfirmed : ${authorless.length}`)
  console.log(`  grants and programmes    : ${targets.length}  ← to clear`)
  console.log(`  investment and in-kind   : ${leftAlone.length}  (always-open is the norm; left alone)\n`)
  for (const t of targets.slice(0, 12)) {
    console.log(`  ${t.title.slice(0, 50).padEnd(52)} ${t.field_provenance?.is_rolling?.source ?? '(no source)'}`)
  }
  if (targets.length > 12) console.log(`  ... and ${targets.length - 12} more`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  let applied = 0, refused = 0
  for (const t of targets) {
    const r = await mergeGrantUpdate({
      id: t.id, fields: { is_rolling: false }, source: SOURCE, db,
      citations: { is_rolling: { snippet:
        'The card said "Rolling, apply any time". The funder\'s page does not say so, and the value came from '
        + `${t.field_provenance?.is_rolling?.source ?? 'no recorded source'} — a backfill stamp rather than anybody's `
        + 'decision. Cleared to "we do not know", which the card renders as "Check website".',
        confidence: 'high' } },
    })
    if (r.applied.includes('is_rolling')) applied++
    if (r.rejected?.length) refused++
  }
  console.log(`\ncleared: ${applied}   refused: ${refused}`)

  const { data: after } = await db.from('scraped_grants')
    .select('id').eq('is_active', true).eq('pipeline_state', 'published').eq('is_rolling', true)
  console.log(`live rows still claiming rolling: ${(after ?? []).length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })

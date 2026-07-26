// Put back eligibility structures that a re-classification removed on no evidence.
//
//   npx tsx scripts/restore-narrowed-structures.ts          # dry run (default)
//   npx tsx scripts/restore-narrowed-structures.ts --apply  # write
//   npx tsx scripts/restore-narrowed-structures.ts --all    # whole catalogue, not just the queue
//
// WHY
// buildClassifyPatch used to replace eligible_structures wholesale. The model
// returns a narrowed non-empty list — not [] — when a page is silent on legal
// form, so with the prompt's "DEFAULT BIAS: TIGHT" each pass came back shorter
// than the last and eligibility ratcheted down. The cause is fixed (the
// narrowing guard in classify.ts), but the guard is add-only going forward: the
// values already dropped stay dropped until something puts them back.
//
// Measured over the review queue 2026-07-25: 152 removals against 117 additions,
// concentrated on cooperative, unincorporated and the ltd forms. Eight were
// checked against the funders' own pages — six plainly wrong, one partly wrong,
// one right by luck, and five of the eight pages said nothing about legal
// structure at all.
//
// This is the direction that costs a user real money: an eligible organisation
// is silently never shown a fund it could have won, and nothing reports it.
//
// ── What gets restored ──
// The before/after snapshot in field_provenance.pipeline_state.diff records what
// the re-enrich chain changed. For each row we restore values that snapshot
// removed and that are still missing, EXCEPT:
//
//   - cio / scio — decided by geography via charityFormJurisdiction(), not by
//     the model. scripts/fix-scio-jurisdiction.ts owns those, and restoring one
//     here would undo a correct jurisdiction fix.
//   - rows whose source text genuinely restricts to charities — CHARITY_ONLY_RE.
//
// Both rules are imported from classify.ts rather than restated, so this script
// and the guard cannot drift apart.
//
// ── Evidence required, by default ──
// "It used to be there" is NOT sufficient grounds to put a structure back. The
// value may have been wrong when it was added, and restoring it re-creates the
// over-tagging error — which is the more expensive one: a fund shown to an
// organisation that cannot legally apply wastes a real application.
//
// Two of the eight audited rows prove the point. Clothworkers' page says "CICs
// WITHOUT share capital", so dropping ltd_shares was right. Trust for London is
// repayable investment, and an unincorporated association has no separate legal
// personality and cannot borrow, so dropping unincorporated was right too.
// Neither is caught by CHARITY_ONLY_RE.
//
// So a value is restored only when ensureExplicitStructures — the same
// deterministic backstop the classifier uses — independently derives it from
// the row's own who_can_apply + description text. That is positive evidence the
// structure IS eligible, not merely absence of evidence that it is not.
//
// --trust-history relaxes this to restore anything previously present. Do not
// use it without reading the rows.
//
// ── Provenance ──
// `ai_classifier:structures_restore:v1` (trust 60).
//
// Trust 60 is required, not preferred: these rows currently carry
// ai_classifier:v3 at trust 60, and the merger rejects a strictly lower source,
// so a system-level write (50) would be silently refused on every row. Equal
// trust is accepted. Unpinned, so a future classify pass can still improve it —
// and with the guard in place that pass can only add, not silently narrow.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARITY_ONLY_RE, JURISDICTION_MANAGED, ensureExplicitStructures } from '../src/lib/classify'
import { extractTagsDiff } from '../src/lib/admin/review-reasons'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:structures_restore:v1'
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

/**
 * Removals confirmed CORRECT by reading the funder's own page, 2026-07-25.
 *
 * The evidence test below infers eligibility from the row's funder_brief, which
 * is a summary. A summary can say "community groups" while the funder's actual
 * who-can-apply list admits only incorporated bodies — so a verified human/agent
 * reading of the real page has to outrank it, or this script re-introduces the
 * very over-tagging it is trying to avoid.
 */
const VERIFIED_CORRECT_REMOVALS: Record<string, string[]> = {
  // TNLCF UK Fund: the /who-can-apply sub-page enumerates a closed list —
  // charity, CIO, CLG, CIC, community benefit society, co-operative society,
  // statutory body, local authority, university. No unincorporated entry.
  'de28e64c-6385-495d-8aa8-eac9d3d7a675': ['unincorporated'],
  // Trust for London Social Investment: repayable investment. An unincorporated
  // association has no separate legal personality and cannot borrow in its own
  // name. The page states no structures at all, but the removal is right.
  '6ffdea3c-fb1c-4e33-87af-b717e961ad91': ['unincorporated'],
  // Clothworkers' Open Grants: "CICs WITHOUT share capital" is explicit.
  '2c129451-eb69-4670-bbd5-8a3f62ef5726': ['ltd_shares'],
  'd679e8d8-0c17-4c9f-aec9-2464bbb2ec9d': ['ltd_shares'],
}

type Row = {
  id: string; title: string; funder: string | null
  description: string | null
  eligible_structures: string[] | null
  funder_brief: Record<string, unknown> | null
  field_provenance: Record<string, unknown> | null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const all   = process.argv.includes('--all')
  const trustHistory = process.argv.includes('--trust-history')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = db.from('scraped_grants')
    .select('id, title, funder, description, eligible_structures, funder_brief, field_provenance')
  q = all ? q.eq('is_active', true) : q.in('pipeline_state', QUEUE_STATES).not('saved_for_later', 'is', 'true')

  const { data, error } = await q.limit(2000)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as Row[]

  const plan: Array<{ row: Row; before: string[]; after: string[]; restored: string[] }> = []
  let skippedCharityOnly = 0, skippedJurisdictionOnly = 0, skippedNothingMissing = 0, skippedNoEvidence = 0, skippedVerified = 0
  // Rows whose eligibility is SETTLED: the removal was right, already put back,
  // or belongs to the jurisdiction rule. Nothing further to decide — they are
  // only still in the queue because a diff exists, and they will re-flag every
  // week until something clears them. `--ids` prints them so they can be
  // confirmed in bulk.
  const settled: Array<{ id: string; funder: string; why: string }> = []

  for (const r of rows) {
    const d = extractTagsDiff(r.field_provenance).find(x => x.field === 'eligible_structures')
    if (!d || d.removed.length === 0) continue

    const live = r.eligible_structures ?? []
    const candidates = d.removed.filter(v => !live.includes(v))
    if (candidates.length === 0) {
      skippedNothingMissing++
      settled.push({ id: r.id, funder: r.funder ?? '', why: 'already restored' })
      continue
    }

    // Never undo a jurisdiction correction.
    const restorable = candidates.filter(v => !JURISDICTION_MANAGED.has(v))
    if (restorable.length === 0) {
      skippedJurisdictionOnly++
      settled.push({ id: r.id, funder: r.funder ?? '', why: 'only cio/scio removed — jurisdiction rule owns it' })
      continue
    }

    const who = typeof r.funder_brief?.who_can_apply === 'string' ? r.funder_brief.who_can_apply : ''
    const text = `${who} ${r.description ?? ''}`
    if (CHARITY_ONLY_RE.test(text)) {
      skippedCharityOnly++
      settled.push({ id: r.id, funder: r.funder ?? '', why: 'funder text restricts to charities — removal correct' })
      continue
    }

    // Positive evidence from the row's own text, via the same backstop the
    // classifier runs. Seeded with [] so we get only what the TEXT supports,
    // independent of what happens to be stored.
    const supported = new Set(ensureExplicitStructures([], text, {
      locationTag: typeof r.funder_brief?.location_tag === 'string' ? r.funder_brief.location_tag : null,
    }))
    const verifiedCorrect = new Set(VERIFIED_CORRECT_REMOVALS[r.id] ?? [])
    const allowed = restorable.filter(v => !verifiedCorrect.has(v))
    if (allowed.length < restorable.length) skippedVerified += restorable.length - allowed.length

    const evidenced = trustHistory ? allowed : allowed.filter(v => supported.has(v))
    if (evidenced.length === 0) { skippedNoEvidence++; continue }

    plan.push({ row: r, before: live, after: [...live, ...evidenced], restored: evidenced })
  }

  if (process.argv.includes('--ids')) {
    console.log(`\nSETTLED — nothing left to decide (${settled.length}):`)
    for (const x of settled) console.log(`${x.id}\t${x.funder.slice(0, 34).padEnd(34)}\t${x.why}`)
    return
  }

  console.log(`\nscope: ${all ? 'whole live catalogue' : 'review queue'} — ${rows.length} rows scanned`)
  console.log(`rows to restore                       : ${plan.length}`)
  console.log(`skipped, charity-only restriction     : ${skippedCharityOnly}`)
  console.log(`skipped, only cio/scio was removed    : ${skippedJurisdictionOnly}`)
  console.log(`skipped, already restored             : ${skippedNothingMissing}`)
  console.log(`held back, removal verified correct    : ${skippedVerified}`)
  console.log(`skipped, text does not support it     : ${skippedNoEvidence}${trustHistory ? '  (--trust-history: evidence check OFF)' : ''}\n`)

  const tally = new Map<string, number>()
  for (const p of plan) for (const v of p.restored) tally.set(v, (tally.get(v) ?? 0) + 1)
  console.log('values restored:')
  for (const [k, v] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}x  ${k}`)
  }

  console.log('\nsample (first 12):')
  for (const p of plan.slice(0, 12)) {
    console.log(`  ${(p.row.funder ?? '').slice(0, 32).padEnd(32)} +${p.restored.join(',')}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const p of plan) {
    try {
      const res = await mergeGrantUpdate({
        id: p.row.id,
        fields: { eligible_structures: p.after },
        source: SOURCE,
        pinned: false,
        db,
      })
      if (res.applied.includes('eligible_structures')) applied++
      else { rejected++; if (rejected <= 5) console.error(`  rejected: ${p.row.title.slice(0, 40)} — ${JSON.stringify(res.rejected)}`) }
    } catch (err) {
      failed++
      console.error(`  failed: ${p.row.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()

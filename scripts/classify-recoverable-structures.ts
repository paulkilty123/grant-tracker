// Give eligible_structures to the recoverable rows the deterministic backstop
// could not reach.
//
// The backstop (scripts/backfill-structures-backstop.ts) fires only on explicit
// text cues and resolved 15 of 40. The remaining 25 have briefs that describe
// the fund without ever naming a legal form, which is exactly the judgement an
// LLM can make and a regex cannot.
//
// ── Why this writes ONLY eligible_structures ─────────────────────────────────
// classifyBatch also returns impact_sectors, target_beneficiaries, niche_tags
// and funding_type, and buildClassifyPatch will happily produce all of them.
// Applying that whole patch is the "Detect all" failure: one weak model pass
// overwrites curated tags wholesale, and a single miss on target_beneficiaries
// wipes it. The task here is the one field that blocks publication, so the
// patch is narrowed to that field and everything else the model said is
// discarded. Narrower blast radius, and the row's other tags stay as they are.
//
// ── Safety ───────────────────────────────────────────────────────────────────
//   * Every target row currently has EMPTY structures, so this can only add.
//     The narrowing guard that matters elsewhere cannot bite here.
//   * A row the model returns nothing usable for is reported, never silently
//     skipped — a missing id in the response is a failure, not a no-op.
//   * Writes as ai_classifier:recoverable_structures:v1 (trust 60). Not admin:,
//     which would pin at 100 and block all future AI correction.
//   * mergeGrantUpdate's `rejected` array is read. A refused write is not a
//     success.
//   * Dry run by default.
//
//   npx tsx scripts/classify-recoverable-structures.ts          # dry run
//   npx tsx scripts/classify-recoverable-structures.ts --apply

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyBatch, validate, buildClassifyPatch, type GrantInput } from '../src/lib/classify'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:recoverable_structures:v1'

/**
 * Funds whose applicant is a PERSON, not an organisation.
 *
 * These are kept in the catalogue (Paul, 2026-07-26: fine "as long as they are
 * tagged for just individuals") but must never carry organisation forms. The
 * classifier does not make this distinction — asked about Wellbeing of Women's
 * research grants, whose own text says "clinicians, midwives, nurses,
 * academics", it proposed registered_charity + cio + scio + both CIC forms.
 * That would let the publish gate clear the row and show a personal research
 * grant to charities.
 *
 * `sole_trader` is a PROXY, not a precise fit. VALID_STRUCTURES has no
 * `individual` value; eligibility.ts maps the alias 'individual' onto
 * sole_trader, and the classifier prompt maps "individuals / sole traders /
 * freelancers" to sole_trader + unincorporated. `unincorporated` is dropped
 * here because an unincorporated association is an organisation, so including
 * it would defeat the point. Tagging sole_trader alone means the matcher's hard
 * structure gate excludes every organisational form, which is the behaviour
 * asked for. A dedicated `individual` value would be the honest fix.
 */
const INDIVIDUAL_APPLICANT: Record<string, string[]> = {
  '1a5b26f7-4ceb-4a08-8f6c-7ea50c450b51': ['sole_trader'],  // Wellbeing of Women — Research Grants
}
/** Small batches: 8192 max_tokens is shared across the batch, and classify.ts
 *  does not check stop_reason, so an oversized batch truncates silently. */
const BATCH = 6

type Row = {
  id: string; title: string; funder: string | null
  description: string | null; location_tag: string | null
  eligible_structures: string[] | null
  funder_brief: Record<string, unknown> | null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, location_tag, eligible_structures, funder_brief')
    .eq('is_active', false).eq('url_status', 'ok').is('rejection_reason', null)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = ((data ?? []) as unknown as Row[])
    .filter(r => !r.eligible_structures || r.eligible_structures.length === 0)

  console.log(`\nrows with no eligibility: ${rows.length}\n`)

  const proposals: { row: Row; structures: string[] }[] = []
  const noResult: Row[] = []

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const input: GrantInput[] = batch.map(r => ({
      id: r.id, title: r.title, funder: r.funder,
      description: r.description,
      what_they_fund: typeof r.funder_brief?.what_they_fund === 'string' ? r.funder_brief.what_they_fund : undefined,
      priorities:    typeof r.funder_brief?.who_can_apply  === 'string' ? r.funder_brief.who_can_apply  : undefined,
    })) as GrantInput[]

    let results: Awaited<ReturnType<typeof classifyBatch>> = []
    try {
      results = await classifyBatch(input)
    } catch (e) {
      console.error(`  batch ${i / BATCH + 1} failed: ${e instanceof Error ? e.message : e}`)
      noResult.push(...batch)
      continue
    }

    const byId = new Map(results.map(r => [String((r as { id?: string }).id ?? ''), r]))
    for (const row of batch) {
      const raw = byId.get(row.id)
      if (!raw) { noResult.push(row); continue }
      const { patch } = buildClassifyPatch({
        result: validate(raw),
        description: row.description,
        funderBrief: row.funder_brief,
        locationTag: row.location_tag,
        existingStructures: row.eligible_structures ?? [],
      })
      // An individual-applicant fund overrides whatever the model proposed.
      const override = INDIVIDUAL_APPLICANT[row.id]
      if (override) { proposals.push({ row, structures: override }); continue }

      const s = patch.eligible_structures
      if (Array.isArray(s) && s.length > 0) proposals.push({ row, structures: s as string[] })
      else noResult.push(row)
    }
    process.stdout.write(`  classified ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`)
  }

  console.log(`\n\nproposed: ${proposals.length}   no usable answer: ${noResult.length}\n`)
  for (const p of proposals) {
    console.log(`  ${(p.row.funder ?? '').slice(0, 30).padEnd(30)} ${p.row.title.slice(0, 40).padEnd(40)} ${p.structures.join(', ')}`)
  }
  if (noResult.length) {
    console.log('\nno usable answer (left untagged, still held by the gate):')
    for (const r of noResult) console.log(`  ${(r.funder ?? '').slice(0, 30).padEnd(30)} ${r.title.slice(0, 44)}`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written. Re-run with --apply.\n'); return }

  let applied = 0, rejected = 0, failed = 0
  for (const p of proposals) {
    try {
      const res = await mergeGrantUpdate({
        id: p.row.id, fields: { eligible_structures: p.structures },
        source: SOURCE, pinned: false, db,
      })
      if (res.applied.includes('eligible_structures')) applied++
      else { rejected++; console.warn(`  rejected: ${p.row.funder} — ${res.rejected.map(x => x.reason).join(', ')}`) }
    } catch (e) {
      failed++
      console.error(`  failed ${p.row.id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()

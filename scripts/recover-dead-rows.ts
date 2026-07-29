// Act on the dead-row triage: tag the individual-applicant funds, classify the
// thin organisation funds, then bring the organisation ones back.
//
//   npx tsx scripts/recover-dead-rows.ts <verified.json>            # dry run
//   npx tsx scripts/recover-dead-rows.ts <verified.json> --apply
//
// TWO DIFFERENT JOBS, deliberately in one place so the split is visible:
//
//   INDIVIDUAL funds  -> eligible_structures = ['individual'], stay inactive.
//     Ten of the twenty verified rows are Community Foundation Wales funds for
//     individuals, not organisations. They belong in the catalogue tagged so the
//     matcher hides them from charities (INDIVIDUAL_ONLY_SCORE_CAP), not
//     republished as organisational grants.
//
//   ORGANISATION funds -> classify, then reactivate.
//     CLASSIFY FIRST. Several carry no impact_sectors at all — Armed Forces
//     Covenant's Service Pupil Support has neither sectors nor structures. The
//     sector gate drops an untagged row for every org, so reactivating it would
//     make it live and invisible at the same time. Tagging before activation is
//     the difference between a recovered grant and a recovered row.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyBatch, buildClassifyPatch, validate } from '../src/lib/classify'
import { mergeGrantUpdate, transitionPipelineState, type PipelineState } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

type Cand = { id: string; funder: string | null; title: string; deadline: string; snippet: string }

const isIndividualFund = (c: Cand) =>
  /individual/i.test(c.title) || /applications are now open to individuals/i.test(c.snippet ?? '')

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!file) { console.error('Usage: npx tsx scripts/recover-dead-rows.ts <verified.json> [--apply]'); process.exit(1) }

  const { strong } = JSON.parse(readFileSync(file, 'utf8')) as { strong: Cand[] }
  const individuals = strong.filter(isIndividualFund)
  const orgs = strong.filter(c => !isIndividualFund(c))

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  console.log(`\nindividual-applicant funds to tag : ${individuals.length}`)
  console.log(`organisation funds to recover     : ${orgs.length}\n`)

  // ── 1. Individual funds ────────────────────────────────────────────────────
  for (const c of individuals) console.log(`  [individual] ${c.funder} — ${c.title.slice(0, 50)}`)

  // ── 2. Organisation funds: which need classifying? ─────────────────────────
  const { data: orgRows } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, impact_sectors, eligible_structures, funder_brief, location_tag, url_status, pipeline_state')
    .in('id', orgs.map(o => o.id))

  type Row = {
    id: string; title: string; funder: string | null; description: string | null
    impact_sectors: string[] | null; eligible_structures: string[] | null
    funder_brief: Record<string, unknown> | null; location_tag: string | null
    pipeline_state: PipelineState
  }
  const rows = (orgRows ?? []) as unknown as Row[]
  const thin = rows.filter(r => !(r.impact_sectors ?? []).length || !(r.eligible_structures ?? []).length)

  console.log(`\n  of the ${rows.length} organisation rows, ${thin.length} are missing sectors or structures:`)
  for (const t of thin) {
    console.log(`    ${(t.funder ?? '?').slice(0, 30).padEnd(30)} sectors=${(t.impact_sectors ?? []).length} structures=${(t.eligible_structures ?? []).length}`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written.\n'); return }

  // Tag the individual funds. They stay inactive: this makes them correct, not live.
  let tagged = 0
  for (const c of individuals) {
    const r = await mergeGrantUpdate({
      id: c.id,
      fields: { eligible_structures: ['individual'] },
      source: 'system:dead-row-triage:2026-07-29',
      pinned: false,
      db,
    })
    if (r.applied.includes('eligible_structures')) tagged++
  }
  console.log(`\ntagged ${tagged}/${individuals.length} individual-applicant funds`)

  // Classify the thin organisation rows before they go live.
  let classified = 0
  if (thin.length) {
    const results = await classifyBatch(thin.map(t => ({
      id: t.id,
      title: t.title ?? '',
      funder: t.funder ?? '',
      description: t.description ?? '',
      what_they_fund: typeof t.funder_brief?.what_they_fund === 'string' ? t.funder_brief.what_they_fund : undefined,
      priorities: typeof t.funder_brief?.priorities === 'string' ? t.funder_brief.priorities : undefined,
    })))
    for (const res of results) {
      const row = thin.find(t => t.id === res.id)
      if (!row) continue
      const validated = validate(res)
      if (!validated) continue
      const { patch } = buildClassifyPatch({
        result: validated,
        description: row.description,
        funderBrief: row.funder_brief,
        title: row.title,
        locationTag: row.location_tag,
        existingStructures: row.eligible_structures,
      })
      const r = await mergeGrantUpdate({ id: row.id, fields: patch, source: 'ai_classifier:v3', pinned: false, db })
      if (r.applied.length) classified++
    }
  }
  console.log(`classified ${classified}/${thin.length} thin rows`)

  // Now reactivate. url_status must move too — leaving it 'dead' means the next
  // validator pass or admin queue treats a live row as broken.
  let live = 0
  for (const row of rows) {
    const nextState = transitionPipelineState({
      current: row.pipeline_state, source: 'admin:dead-row-recovery',
      fields: { is_active: true }, anyTrackedWritten: false,
    })
    const { error } = await db.from('scraped_grants').update({
      is_active: true,
      pipeline_state: nextState,
      url_status: 'ok',
      url_last_checked: new Date().toISOString(),
    }).eq('id', row.id)
    if (!error) live++
    else console.error(`  FAILED ${row.funder}: ${error.message}`)
  }
  console.log(`reactivated ${live}/${rows.length} organisation funds\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
